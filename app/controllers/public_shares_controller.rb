class PublicSharesController < ActionController::Base
  include ImageDelivery
  include ShareUrl

  UNAVAILABLE = "This link isn't available. It may have expired or been turned off."
  THROTTLED = "Too many requests, try again in a minute"
  SINGLE_DESCRIPTION = "A swatch shared from Swatch"

  layout "public"

  content_security_policy do |policy|
    policy.default_src :self
    policy.base_uri :self
    policy.font_src :self
    policy.object_src :none
    policy.script_src :none
    policy.style_src :self, :unsafe_inline
    policy.connect_src :none
    policy.form_action :self
    policy.frame_ancestors :none
    sources = [ :self, :data ]
    account_id = ENV["R2_ACCOUNT_ID"].to_s
    if account_id.match?(/\A[A-Za-z0-9]+\z/)
      sources << "https://#{account_id}.r2.cloudflarestorage.com"
    end
    policy.img_src(*sources)
  end

  rate_limit to: 60, within: 1.minute,
    only: %i[show item unavailable],
    store: PublicShareLimit::STORE,
    name: "public-pages",
    by: -> { request.remote_ip },
    with: :render_throttled

  rate_limit to: 300, within: 1.minute,
    only: :image,
    store: PublicShareLimit::STORE,
    name: "public-images",
    by: -> { request.remote_ip },
    with: :render_throttled

  before_action :prepare_public
  before_action :load_link, only: %i[show item image]

  helper_method :safe_color, :public_http_url, :image_size, :public_alt

  def show
    if @link.item_id
      present_item(@link.item, back: false)
    else
      present_collection
    end
  end

  def item
    found = @link.item_for_key(params[:key])
    return render_unavailable unless found

    present_item(found, back: @link.tag_id.present?)
  end

  def image
    found = @link.item_for_key(params[:key])
    return render_unavailable unless found&.image&.attached?
    return render_unavailable unless VARIANTS.include?(params[:variant])

    loaded = Item.with_attached_image.find(found.id)
    deliver_image(loaded.image, params[:variant], cache_max_age: 60)
  rescue Swatch::ImageStorage::Unavailable, Vips::Error, ActiveStorage::InvariableError
    render_storage_unavailable
  rescue StandardError => error
    raise unless image_storage_outage?(error)

    render_storage_unavailable
  end

  def unavailable
    render_unavailable
  end

  private
    def prepare_public
      request.session_options[:skip] = true
      response.set_header("Referrer-Policy", "no-referrer")
      response.set_header("X-Robots-Tag", "noindex, nofollow, noarchive")
      response.set_header("X-Frame-Options", "DENY")
    end

    def load_link
      @link = ShareLink.includes(:item, :tag).find_by(token: params[:token])
      render_unavailable unless @link&.active?
    end

    def present_item(item, back:)
      return render_unavailable unless item && item.user_id == @link.user_id

      @item = Item.with_attached_image.find(item.id)
      @back = back
      return unless fresh_public(single_etag(@item))

      assign_page(@link.public_title, SINGLE_DESCRIPTION, preview_url(@item))
      render :show
    end

    def present_collection
      @page = PublicCollection.page(@link, params[:after])
      return unless fresh_public(collection_etag(@page))

      description = collection_description(@page.total)
      assign_page(@link.public_title, description, preview_url(collection_preview))
      render :collection
    end

    def fresh_public(etag)
      visible = stale?(etag: etag, public: false, cache_control: { no_cache: true, extras: [ "private" ] })
      @link.record_view! if visible
      visible
    end

    # Rails drops a private directive when no-cache is set on the header
    # itself. Putting private in extras keeps both words in the response.
    def private_no_cache
      response.cache_control[:no_cache] = true
      extras = Array(response.cache_control[:extras])
      extras << "private" unless extras.include?("private")
      response.cache_control[:extras] = extras
    end

    def single_etag(item)
      [ @link.cache_key_with_version, item.cache_key_with_version, attachment_stamp(item) ]
    end

    def collection_etag(page)
      [
        @link.cache_key_with_version,
        page.total,
        page.page_number,
        params[:after].to_s,
        page.items.map { |item| [ item.cache_key_with_version, attachment_stamp(item) ] }
      ]
    end

    def attachment_stamp(item)
      return unless item.image.attached?

      attachment = item.image.attachment
      "#{attachment.blob_id}-#{attachment.created_at.to_i}"
    end

    def assign_page(title, description, image)
      @page_title = title
      @og_description = description
      @og_image = image
      @og_url = share_link_url(@link)
    end

    def preview_url(item)
      return unless @link.include_preview_image && item&.image&.attached?

      share_absolute(public_share_image_path(@link.token, @link.signed_key(item), "card_2x"))
    end

    def collection_preview
      PublicCollection.preview_item(@link)
    end

    def render_unavailable
      throttled = PublicShareLimit.record_miss!(request.remote_ip)
      @message = throttled ? THROTTLED : UNAVAILABLE
      @page_title = "Link not available"
      @og_description = @message
      @og_image = nil
      private_no_cache
      render :unavailable, status: (throttled ? :too_many_requests : :not_found)
    end

    def render_throttled
      @message = THROTTLED
      @page_title = "Link not available"
      @og_description = @message
      @og_image = nil
      private_no_cache
      render :unavailable, status: :too_many_requests
    end

    def render_storage_unavailable
      @message = "The image store is unavailable. Try again in a moment."
      @page_title = "Link not available"
      @og_description = @message
      @og_image = nil
      private_no_cache
      render :unavailable, status: :service_unavailable
    end

    def safe_color(value)
      hex = value.to_s
      hex.match?(/\A#[0-9A-F]{6}\z/) ? hex : nil
    end

    def public_http_url(value)
      uri = URI.parse(value.to_s)
      return unless uri.is_a?(URI::HTTP) && uri.host.present?
      return unless %w[http https].include?(uri.scheme)

      value.to_s
    rescue URI::InvalidURIError
      nil
    end

    def image_size(item)
      blob = item.image.blob
      width = blob.metadata["width"].to_i
      height = blob.metadata["height"].to_i
      width = 1200 if width <= 0
      height = 900 if height <= 0
      [ width, height ]
    end

    def public_alt(item)
      item.image_alt.presence || "Image for #{item.title}"
    end

    def collection_description(total)
      noun = total == 1 ? "swatch" : "swatches"
      "#{total} #{noun} shared from Swatch"
    end
end
