class RequireUserOnItemsAndTags < ActiveRecord::Migration[8.1]
  def up
    # Hold off new saves until this transaction ends, so a row cannot
    # appear with no owner between the count and the constraint change.
    # Refusing rolls the transaction back, releases the lock, and changes nothing.
    execute "LOCK TABLE items, tags IN SHARE ROW EXCLUSIVE MODE"

    missing_items = select_value("SELECT COUNT(*) FROM items WHERE user_id IS NULL").to_i
    missing_tags = select_value("SELECT COUNT(*) FROM tags WHERE user_id IS NULL").to_i
    if missing_items.positive? || missing_tags.positive?
      raise <<~MSG.strip
        Refusing to require an owner.
        #{missing_items} #{"swatch".pluralize(missing_items)} and #{missing_tags} #{"tag".pluralize(missing_tags)} still have no owner.
        No rows were changed or deleted. The previous version stays live.
      MSG
    end

    change_column_null :items, :user_id, false
    change_column_null :tags, :user_id, false
    add_owner_foreign_key :items
    add_owner_foreign_key :tags
  end

  def down
    change_column_null :items, :user_id, true
    change_column_null :tags, :user_id, true
  end

  private
    def add_owner_foreign_key(table)
      return if foreign_key_exists?(table, :users, column: :user_id)

      add_foreign_key table, :users, column: :user_id, on_delete: :cascade
    end
end
