class Item < ApplicationRecord
  belongs_to :user
  has_many :item_tags
  has_many :tags, through: :item_tags
  has_one_attached :image, dependent: :purge do |attachable|
    saver = { quality: 80, strip: true }
    attachable.variant :card, resize_to_limit: [ 400, nil ], format: :webp, saver: saver, preprocessed: true
    attachable.variant :card_2x, resize_to_limit: [ 800, nil ], format: :webp, saver: saver, preprocessed: true
    attachable.variant :large, resize_to_limit: [ 1600, nil ], format: :webp, saver: saver, preprocessed: true
  end

  before_validation :assign_current_user, on: :create
  before_validation :normalize_fields

  validates :title, presence: true, length: { maximum: 120 }
  validates :notes, length: { maximum: 2000 }, allow_nil: true
  validates :image_alt, length: { maximum: 250 }, allow_nil: true
  validates :color,
    format: { with: /\A#[0-9A-F]{6}\z/, message: "must be a hex colour like #7C2D24" },
    allow_nil: true
  validate :source_url_must_be_http

  def source_domain
    return if source_url.blank?

    URI.parse(source_url).host
  rescue URI::InvalidURIError
    nil
  end

  def as_api_json
    {
      id: id,
      title: title,
      source_url: source_url,
      source_domain: source_domain,
      notes: notes,
      color: color,
      created_at: created_at.iso8601,
      tags: tags.sort_by { |tag| tag.name.downcase }.map { |tag| { id: tag.id, name: tag.name } },
      image: image_payload
    }
  end

  def image_payload
    return nil unless image.attached?

    blob = image.blob
    {
      alt: image_alt,
      width: blob.metadata["width"],
      height: blob.metadata["height"],
      content_type: blob.content_type,
      byte_size: blob.byte_size,
      version: blob.id,
      urls: {
        card: image_path("card", blob),
        card_2x: image_path("card_2x", blob),
        large: image_path("large", blob)
      }
    }
  end

  def replace_tag_names(raw_names)
    names = Array(raw_names).map { |name| Tag.normalize_name(name) }.reject(&:blank?)
    names = names.uniq { |name| name.downcase }
    if names.size > 10
      errors.add(:tags, "can have at most 10 tags")
      return false
    end

    records = names.map { |name| Tag.find_or_create_by_name!(name, user: user) }
    invalid = records.select { |tag| tag.errors.any? }
    if invalid.any?
      invalid.each do |tag|
        tag.errors.each { |error| errors.add(:tags, error.message) }
      end
      return false
    end

    self.tags = records
    true
  end

  private
    def assign_current_user
      self.user ||= Current.user
    end

    def normalize_fields
      self.title = title.to_s.strip
      self.notes = notes.to_s.strip.presence
      self.color = color.to_s.strip.upcase.presence
      self.image_alt = image_alt.to_s.strip.presence
      stripped = source_url.to_s.strip
      self.source_url = if stripped.empty?
        nil
      else
        stripped.sub(/\A([A-Za-z][A-Za-z0-9+.-]*:)/, &:downcase)
      end
    end

    def image_path(variant, blob)
      Rails.application.routes.url_helpers.api_v1_item_image_variant_path(self, variant, v: blob.id)
    end

    def source_url_must_be_http
      return if source_url.nil?

      if source_url.length > 2048
        errors.add(:source_url, "is too long (maximum is 2048 characters)")
        return
      end

      uri = URI.parse(source_url)
      http = uri.is_a?(URI::HTTP) && uri.host.present?
      errors.add(:source_url, "must be an http or https URL") unless http
    rescue URI::InvalidURIError
      errors.add(:source_url, "must be an http or https URL")
    end
end
