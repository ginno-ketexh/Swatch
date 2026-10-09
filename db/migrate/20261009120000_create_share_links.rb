class CreateShareLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :share_links do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :token, null: false
      t.references :item, foreign_key: { on_delete: :cascade }
      t.references :tag, foreign_key: { on_delete: :cascade }
      t.string :title, limit: 80
      t.boolean :include_notes, null: false, default: false
      t.boolean :include_preview_image, null: false, default: false
      t.datetime :expires_at
      t.integer :views_count, null: false, default: 0
      t.datetime :last_viewed_at
      t.timestamps
    end

    add_index :share_links, :token, unique: true
    add_index :share_links, :expires_at
    add_check_constraint :share_links,
      "num_nonnulls(item_id, tag_id) = 1",
      name: "share_links_one_target"
    add_check_constraint :share_links,
      "title IS NULL OR char_length(title) <= 80",
      name: "share_links_title_length"
  end
end
