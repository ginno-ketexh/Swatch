class CreateItems < ActiveRecord::Migration[8.1]
  def change
    create_table :items do |t|
      t.string :title, null: false, limit: 120
      t.string :source_url, limit: 2048
      t.text :notes
      t.string :color, limit: 7

      t.timestamps
    end

    add_check_constraint :items,
      "char_length(btrim(title)) BETWEEN 1 AND 120",
      name: "items_title_length"
    add_check_constraint :items,
      "source_url IS NULL OR (char_length(source_url) <= 2048 AND source_url ~* '^https?://[^[:space:]/]+')",
      name: "items_source_url_http"
    add_check_constraint :items,
      "notes IS NULL OR char_length(notes) <= 2000",
      name: "items_notes_length"
    add_check_constraint :items,
      "color IS NULL OR color ~ '^#[0-9A-F]{6}$'",
      name: "items_color_hex"
    add_index :items, [ :created_at, :id ]
  end
end
