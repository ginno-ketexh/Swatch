class Item < ApplicationRecord
  has_many :item_tags
  has_many :tags, through: :item_tags

  before_validation :normalize_fields

  validates :title, presence: true, length: { maximum: 120 }
  validates :notes, length: { maximum: 2000 }, allow_nil: true
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
      tags: tags.sort_by { |tag| tag.name.downcase }.map { |tag| { id: tag.id, name: tag.name } }
    }
  end

  def replace_tag_names(raw_names)
    names = Array(raw_names).map { |name| Tag.normalize_name(name) }.reject(&:blank?)
    names = names.uniq { |name| name.downcase }
    if names.size > 10
      errors.add(:tags, "can have at most 10 tags")
      return false
    end

    records = names.map { |name| Tag.find_or_create_by_name!(name) }
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
    def normalize_fields
      self.title = title.to_s.strip
      self.notes = notes.to_s.strip.presence
      self.color = color.to_s.strip.upcase.presence
      stripped = source_url.to_s.strip
      self.source_url = if stripped.empty?
        nil
      else
        stripped.sub(/\A([A-Za-z][A-Za-z0-9+.-]*:)/, &:downcase)
      end
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
