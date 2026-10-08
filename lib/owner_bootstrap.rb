# Creates the first owner during deploy when the database has no account yet.
# Once an account exists, an empty environment is enough: this does not read
# OWNER_EMAIL or OWNER_PASSWORD. OWNER_NEW_PASSWORD is optional and only
# replaces a forgotten password.
#
# The require-owner migration runs first and stops the deploy, without
# changing rows, if a swatch or tag still has no owner. The backfill below
# only matters when that column is still optional.
# A failure raises OwnerBootstrap::Error so the build stops and the previous
# version stays live.
class OwnerBootstrap
  class Error < StandardError; end

  def self.call!(env: ENV, logger: Rails.logger, connection: ActiveRecord::Base.connection)
    new(env, logger, connection).call!
  end

  def initialize(env, logger, connection)
    @env = env
    @logger = logger
    @connection = connection
  end

  def call!
    raise Error, "Run database migrations before creating the owner account." unless tables_ready?

    created_email = nil
    notice = nil

    User.transaction do
      owner = User.order(:id).first
      if owner.nil?
        owner = create_owner!
        created_email = owner.email_address
      else
        notice = apply_new_password!(owner)
      end
      backfill!(owner)
    end

    @logger.info("Owner account created for #{User.mask_email(created_email)}") if created_email
    @logger.info(notice) if notice
    true
  end

  private
    def tables_ready?
      @connection.table_exists?(:users) &&
        @connection.table_exists?(:items) &&
        @connection.table_exists?(:tags) &&
        @connection.column_exists?(:items, :user_id) &&
        @connection.column_exists?(:tags, :user_id)
    end

    def create_owner!
      email = setting("OWNER_EMAIL")
      password = setting("OWNER_PASSWORD")
      raise Error, "OWNER_EMAIL is missing" if email.empty?
      raise Error, "OWNER_PASSWORD is missing" if password.empty?
      unless email.match?(User::EMAIL_FORMAT) && email.length <= 254
        raise Error, "OWNER_EMAIL is not a valid email address"
      end
      raise Error, "OWNER_PASSWORD must be at least 15 characters" if password.length < 15
      raise Error, "OWNER_PASSWORD is too long" if password.bytesize > 72

      User.create!(email_address: email, password: password)
    end

    def apply_new_password!(owner)
      password = setting("OWNER_NEW_PASSWORD")
      return if password.empty?

      if password.length < 15
        raise Error, "OWNER_NEW_PASSWORD must be at least 15 characters"
      end
      raise Error, "OWNER_NEW_PASSWORD is too long" if password.bytesize > 72

      if owner.authenticate(password)
        return "Remove OWNER_NEW_PASSWORD from Render now."
      end

      owner.update!(password: password)
      owner.sessions.delete_all
      "Owner password reset; remove OWNER_NEW_PASSWORD from Render now"
    end

    def backfill!(owner)
      Item.where(user_id: nil).update_all(user_id: owner.id)

      owner_names = Tag.where(user_id: owner.id).pluck(Arel.sql("lower(name)"))
      safe_tags = Tag.where(user_id: nil)
      safe_tags = safe_tags.where("lower(name) NOT IN (?)", owner_names) if owner_names.any?
      safe_tags.update_all(user_id: owner.id)

      Tag.where(user_id: nil).find_each do |orphan|
        merge_tag!(orphan, owner)
      end
    end

    def merge_tag!(orphan, owner)
      keeper = Tag.where(user_id: owner.id).where("lower(name) = ?", orphan.name.downcase).first
      unless keeper
        orphan.update!(user_id: owner.id)
        return
      end

      duplicate_items = ItemTag.where(tag_id: keeper.id).select(:item_id)
      ItemTag.where(tag_id: orphan.id, item_id: duplicate_items).delete_all
      ItemTag.where(tag_id: orphan.id).update_all(tag_id: keeper.id)
      orphan.delete
    end

    def setting(name)
      @env[name].to_s.unicode_normalize(:nfc).strip
    end
end
