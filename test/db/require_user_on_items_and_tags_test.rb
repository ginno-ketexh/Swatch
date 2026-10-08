require "test_helper"
require Rails.root.join("db/migrate/20261008140000_require_user_on_items_and_tags")

class RequireUserOnItemsAndTagsTest < ActiveSupport::TestCase
  setup do
    @migration = RequireUserOnItemsAndTags.new
    @migration.verbose = false
  end

  teardown do
    restore_required_owner!
  end

  test "every swatch and tag requires an owner and points at an account" do
    assert_not Item.columns_hash.fetch("user_id").null
    assert_not Tag.columns_hash.fetch("user_id").null
    assert connection.foreign_key_exists?(:items, :users, column: :user_id)
    assert connection.foreign_key_exists?(:tags, :users, column: :user_id)
  end

  test "a row with no owner stops the migration and is left in place" do
    relax_owner_requirement!
    item_id = insert_row("items", "title", "Orphan lamp")
    tag_id = insert_row("tags", "name", "Loose")

    error = assert_raises(RuntimeError) { @migration.migrate(:up) }

    assert_includes error.message, "Refusing to require an owner."
    assert_includes error.message, "1 swatch and 1 tag still have no owner."
    assert_includes error.message, "No rows were changed or deleted. The previous version stays live."
    assert_equal 1, count_unowned("items", item_id)
    assert_equal 1, count_unowned("tags", tag_id)
    assert Item.columns_hash.fetch("user_id").null
    assert Tag.columns_hash.fetch("user_id").null
  end

  test "rows that already have an owner are kept" do
    item = Item.create!(title: "Kept lamp", user: users(:owner))
    tag = Tag.create!(name: "kept", user: users(:owner))

    @migration.migrate(:up)

    assert_equal users(:owner).id, item.reload.user_id
    assert_equal users(:owner).id, tag.reload.user_id
    assert_not Item.columns_hash.fetch("user_id").null
    assert_not Tag.columns_hash.fetch("user_id").null
    assert connection.foreign_key_exists?(:items, :users, column: :user_id)
    assert connection.foreign_key_exists?(:tags, :users, column: :user_id)
  end

  test "reverting makes the owner optional and keeps the link to accounts" do
    @migration.migrate(:down)
    Item.reset_column_information
    Tag.reset_column_information

    assert Item.columns_hash.fetch("user_id").null
    assert Tag.columns_hash.fetch("user_id").null
    assert connection.foreign_key_exists?(:items, :users, column: :user_id)
    assert connection.foreign_key_exists?(:tags, :users, column: :user_id)
  end

  private
    def connection
      ActiveRecord::Base.connection
    end

    def relax_owner_requirement!
      connection.change_column_null(:items, :user_id, true)
      connection.change_column_null(:tags, :user_id, true)
      Item.reset_column_information
      Tag.reset_column_information
    end

    def restore_required_owner!
      connection.execute(<<~SQL.squish)
        DELETE FROM item_tags
        WHERE tag_id IN (SELECT id FROM tags WHERE user_id IS NULL)
           OR item_id IN (SELECT id FROM items WHERE user_id IS NULL)
      SQL
      connection.execute("DELETE FROM tags WHERE user_id IS NULL")
      connection.execute("DELETE FROM items WHERE user_id IS NULL")
      connection.change_column_null(:items, :user_id, false)
      connection.change_column_null(:tags, :user_id, false)
    ensure
      Item.reset_column_information
      Tag.reset_column_information
    end

    def insert_row(table, column, value)
      quoted_table = connection.quote_table_name(table)
      quoted_column = connection.quote_column_name(column)
      sql = <<~SQL.squish
        INSERT INTO #{quoted_table} (#{quoted_column}, created_at, updated_at)
        VALUES (#{connection.quote(value)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      SQL
      connection.exec_query(sql).rows.first.first
    end

    def count_unowned(table, id)
      quoted_table = connection.quote_table_name(table)
      sql = <<~SQL.squish
        SELECT COUNT(*) FROM #{quoted_table}
        WHERE id = #{connection.quote(id)} AND user_id IS NULL
      SQL
      connection.select_value(sql).to_i
    end
end
