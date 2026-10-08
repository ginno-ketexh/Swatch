# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_08_120000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pg_trgm"

  create_table "item_tags", force: :cascade do |t|
    t.bigint "item_id", null: false
    t.bigint "tag_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["item_id", "tag_id"], name: "index_item_tags_on_item_id_and_tag_id", unique: true
    t.index ["item_id"], name: "index_item_tags_on_item_id"
    t.index ["tag_id"], name: "index_item_tags_on_tag_id"
  end

  create_table "items", force: :cascade do |t|
    t.string "title", limit: 120, null: false
    t.string "source_url", limit: 2048
    t.text "notes"
    t.string "color", limit: 7
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((title)::text), id", name: "index_items_on_lower_title_and_id"
    t.index ["created_at", "id"], name: "index_items_on_created_at_and_id"
    t.index ["notes"], name: "index_items_on_notes_trigram", opclass: :gin_trgm_ops, using: :gin
    t.index ["source_url"], name: "index_items_on_source_url_trigram", opclass: :gin_trgm_ops, using: :gin
    t.index ["title"], name: "index_items_on_title_trigram", opclass: :gin_trgm_ops, using: :gin
    t.check_constraint "char_length(btrim(title::text)) >= 1 AND char_length(btrim(title::text)) <= 120", name: "items_title_length"
    t.check_constraint "color IS NULL OR color::text ~ '^#[0-9A-F]{6}$'::text", name: "items_color_hex"
    t.check_constraint "notes IS NULL OR char_length(notes) <= 2000", name: "items_notes_length"
    t.check_constraint "source_url IS NULL OR char_length(source_url::text) <= 2048 AND source_url::text ~* '^https?://[^[:space:]/]+'::text", name: "items_source_url_http"
  end

  create_table "tags", force: :cascade do |t|
    t.string "name", limit: 30, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((name)::text)", name: "index_tags_on_lower_name", unique: true
    t.check_constraint "char_length(btrim(name::text)) >= 1 AND char_length(btrim(name::text)) <= 30", name: "tags_name_length"
  end

  add_foreign_key "item_tags", "items", on_delete: :cascade
  add_foreign_key "item_tags", "tags", on_delete: :cascade
end
