class AddSearchAndTags < ActiveRecord::Migration[8.1]
  def change
    enable_extension "pg_trgm"

    add_index :items, :title, using: :gin, opclass: :gin_trgm_ops, name: "index_items_on_title_trigram"
    add_index :items, :notes, using: :gin, opclass: :gin_trgm_ops, name: "index_items_on_notes_trigram"
    add_index :items, :source_url, using: :gin, opclass: :gin_trgm_ops, name: "index_items_on_source_url_trigram"
    add_index :items, "lower(title), id", name: "index_items_on_lower_title_and_id"

    create_table :tags do |t|
      t.string :name, null: false, limit: 30
      t.timestamps
    end
    add_index :tags, "lower(name)", unique: true, name: "index_tags_on_lower_name"
    add_check_constraint :tags, "char_length(btrim(name)) BETWEEN 1 AND 30", name: "tags_name_length"

    create_table :item_tags do |t|
      t.references :item, null: false, foreign_key: { on_delete: :cascade }
      t.references :tag, null: false, foreign_key: { on_delete: :cascade }, index: true
      t.timestamps
    end
    add_index :item_tags, [ :item_id, :tag_id ], unique: true, name: "index_item_tags_on_item_id_and_tag_id"
  end
end
