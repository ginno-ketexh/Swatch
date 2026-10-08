class AddUserToItemsAndTags < ActiveRecord::Migration[8.1]
  def change
    # Nullable on purpose. The old version can still save rows while this
    # deploy is switching over. A later change will require a user.
    add_reference :items, :user, foreign_key: { on_delete: :cascade }
    add_reference :tags, :user, foreign_key: { on_delete: :cascade }

    remove_index :tags, name: "index_tags_on_lower_name"
    add_index :tags, "user_id, lower(name)",
      unique: true,
      nulls_not_distinct: true,
      name: "index_tags_on_user_id_and_lower_name"

    add_index :items, [ :user_id, :created_at, :id ], name: "index_items_on_user_id_and_created_at_and_id"
    add_index :items, "user_id, lower(title), id", name: "index_items_on_user_id_and_lower_title_and_id"
  end
end
