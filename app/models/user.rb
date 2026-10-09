class User < ApplicationRecord
  EMAIL_FORMAT = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :items, dependent: :destroy
  has_many :tags, dependent: :destroy
  has_many :share_links, dependent: :destroy

  normalizes :email_address, with: ->(email) { email.to_s.strip.downcase }

  validates :email_address,
    presence: true,
    length: { maximum: 254 },
    format: { with: EMAIL_FORMAT, message: "is not a valid email address" },
    uniqueness: { case_sensitive: false }
  validate :password_policy, if: -> { password.present? }
  validate :password_must_change, if: -> { password.present? && password_digest_was.present? }

  # bcrypt refuses a password over 72 bytes. Keep the value so the
  # validation can explain it, and do not hash it.
  def password=(unencrypted_password)
    if unencrypted_password.to_s.bytesize > 72
      @password = unencrypted_password
      return
    end

    super
  end

  def self.mask_email(email)
    local, domain = email.to_s.split("@", 2)
    return "unknown" if local.blank? || domain.blank?

    "#{local[0]}***@…"
  end

  private
    def password_policy
      errors.add(:password, "must be at least 15 characters") if password.length < 15
      errors.add(:password, "is too long") if password.bytesize > 72
    end

    def password_must_change
      return unless BCrypt::Password.new(password_digest_was).is_password?(password)

      errors.add(:password, "must be different from the current password")
    end
end
