class Tag < ApplicationRecord
  belongs_to :user
  has_many :item_tags
  has_many :items, through: :item_tags

  before_validation :assign_current_user, on: :create
  before_validation :normalize_name

  validates :name, presence: true, length: { maximum: 30 }
  validate :allowed_characters
  validate :unique_lower_name

  def self.normalize_name(raw)
    value = raw.to_s.unicode_normalize(:nfc)
    value = value.gsub(/\p{Cc}/, "")
    value.strip.gsub(/\s+/, " ")
  end

  def self.find_or_create_by_name!(raw, user: Current.user)
    raise ArgumentError, "a user is required" if user.nil?

    normalized = normalize_name(raw)
    existing = where(user_id: user.id).where("lower(name) = ?", normalized.downcase).first
    return existing if existing

    candidate = new(name: normalized, user: user)
    candidate.validate
    # Uniqueness is not a reason to reject a lookup. Another request may
    # have saved this name between the find and the check.
    taken = "A tag with that name already exists"
    other_problems = candidate.errors[:name].reject { |message| message == taken }
    return candidate if other_problems.any?
    if candidate.errors[:name].include?(taken)
      return where(user_id: user.id).where("lower(name) = ?", normalized.downcase).first || candidate
    end

    transaction(requires_new: true) { create!(name: normalized, user: user) }
  rescue ActiveRecord::RecordNotUnique
    where(user_id: user.id).where("lower(name) = ?", normalized.downcase).first!
  end

  def as_api_json(items_count:)
    { id: id, name: name, items_count: items_count }
  end

  private
    def assign_current_user
      self.user ||= Current.user
    end

    def normalize_name
      self.name = self.class.normalize_name(name)
    end

    def allowed_characters
      return if name.blank?
      return if name.match?(/\A[\p{L}\p{N} \-_&.']+\z/)

      errors.add(:name, "can only use letters, numbers, spaces, and - _ & . '")
    end

    def unique_lower_name
      return if name.blank?

      scope = Tag.where(user_id: user_id).where("lower(name) = ?", name.downcase)
      scope = scope.where.not(id: id) if persisted?
      errors.add(:name, "A tag with that name already exists") if scope.exists?
    end
end
