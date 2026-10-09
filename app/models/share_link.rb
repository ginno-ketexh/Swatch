class ShareLink < ApplicationRecord
  EXPIRY_CHOICES = {
    "1d" => 1.day,
    "7d" => 7.days,
    "30d" => 30.days,
    "never" => nil
  }.freeze
  MAX_LINKS = 50
  TOKEN_FORMAT = /\A[1-9A-HJ-NP-Za-km-z]{36}\z/

  belongs_to :user
  belongs_to :item, optional: true
  belongs_to :tag, optional: true

  has_secure_token :token, length: 36

  normalizes :title, with: ->(value) { value.to_s.strip.presence }

  validates :token, presence: true, uniqueness: true, format: { with: TOKEN_FORMAT }
  validates :title, length: { maximum: 80 }, allow_nil: true
  validate :exactly_one_target
  validate :target_belongs_to_owner
  validate :within_link_cap, on: :create

  scope :active, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }
  scope :expired, -> { where.not(expires_at: nil).where(expires_at: ..Time.current) }

  def self.expiry_time(choice, now = Time.current)
    duration = EXPIRY_CHOICES.fetch(choice.to_s)
    duration ? now + duration : nil
  end

  def active?
    expires_at.nil? || expires_at > Time.current
  end

  def kind
    item_id.present? ? "item" : "tag"
  end

  def target_title
    item&.title || tag&.name
  end

  def public_title
    title.presence || target_title || "Shared"
  end

  def share_purpose
    "share:#{id}"
  end

  def signed_key(record)
    record.signed_id(purpose: share_purpose)
  end

  def item_for_key(key)
    found = Item.find_signed(key.to_s, purpose: share_purpose)
    return unless found && covers?(found)

    found
  end

  def covers?(found)
    return false unless found.user_id == user_id

    if item_id.present?
      found.id == item_id
    else
      found.item_tags.exists?(tag_id: tag_id)
    end
  end

  def as_api_json(url:)
    {
      id: id,
      url: url,
      kind: kind,
      target_title: target_title,
      title: title,
      include_notes: include_notes,
      include_preview_image: include_preview_image,
      expires_at: expires_at&.iso8601,
      views_count: views_count,
      last_viewed_at: last_viewed_at&.iso8601,
      status: active? ? "active" : "expired",
      created_at: created_at.iso8601,
      item_id: item_id,
      tag_id: tag_id
    }
  end

  # Views must not change updated_at. The public ETag is that timestamp.
  def record_view!
    now = Time.current
    self.class.increment_counter(:views_count, id, touch: false)
    previous = self.class.where(id: id).pick(:last_viewed_at)
    return if previous && previous > now - 1.minute

    update_columns(last_viewed_at: now)
  end

  private
    def exactly_one_target
      return if [ item_id, tag_id ].compact.size == 1

      errors.add(:base, "Choose a swatch or a tag")
    end

    def target_belongs_to_owner
      errors.add(:item, "must belong to you") if item && item.user_id != user_id
      errors.add(:tag, "must belong to you") if tag && tag.user_id != user_id
    end

    def within_link_cap
      return if user.nil?
      return if user.share_links.count < MAX_LINKS

      errors.add(:base, "You have 50 share links. Remove some first.")
    end
end
