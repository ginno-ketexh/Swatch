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

ActiveRecord::Schema[8.1].define(version: 2026_10_09_120000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pg_trgm"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

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
    t.bigint "user_id", null: false
    t.string "image_alt", limit: 250
    t.index "lower((title)::text), id", name: "index_items_on_lower_title_and_id"
    t.index "user_id, lower((title)::text), id", name: "index_items_on_user_id_and_lower_title_and_id"
    t.index ["created_at", "id"], name: "index_items_on_created_at_and_id"
    t.index ["notes"], name: "index_items_on_notes_trigram", opclass: :gin_trgm_ops, using: :gin
    t.index ["source_url"], name: "index_items_on_source_url_trigram", opclass: :gin_trgm_ops, using: :gin
    t.index ["title"], name: "index_items_on_title_trigram", opclass: :gin_trgm_ops, using: :gin
    t.index ["user_id", "created_at", "id"], name: "index_items_on_user_id_and_created_at_and_id"
    t.index ["user_id"], name: "index_items_on_user_id"
    t.check_constraint "char_length(btrim(title::text)) >= 1 AND char_length(btrim(title::text)) <= 120", name: "items_title_length"
    t.check_constraint "color IS NULL OR color::text ~ '^#[0-9A-F]{6}$'::text", name: "items_color_hex"
    t.check_constraint "image_alt IS NULL OR char_length(image_alt::text) <= 250", name: "items_image_alt_length"
    t.check_constraint "notes IS NULL OR char_length(notes) <= 2000", name: "items_notes_length"
    t.check_constraint "source_url IS NULL OR char_length(source_url::text) <= 2048 AND source_url::text ~* '^https?://[^[:space:]/]+'::text", name: "items_source_url_http"
  end

  create_table "sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "ip_address"
    t.string "user_agent", limit: 255
    t.datetime "expires_at", null: false
    t.datetime "last_seen_at", null: false
    t.boolean "remember", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_sessions_on_expires_at"
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "share_links", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "token", null: false
    t.bigint "item_id"
    t.bigint "tag_id"
    t.string "title", limit: 80
    t.boolean "include_notes", default: false, null: false
    t.boolean "include_preview_image", default: false, null: false
    t.datetime "expires_at"
    t.integer "views_count", default: 0, null: false
    t.datetime "last_viewed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_share_links_on_expires_at"
    t.index ["item_id"], name: "index_share_links_on_item_id"
    t.index ["tag_id"], name: "index_share_links_on_tag_id"
    t.index ["token"], name: "index_share_links_on_token", unique: true
    t.index ["user_id"], name: "index_share_links_on_user_id"
    t.check_constraint "num_nonnulls(item_id, tag_id) = 1", name: "share_links_one_target"
    t.check_constraint "title IS NULL OR char_length(title::text) <= 80", name: "share_links_title_length"
  end

  create_table "tags", force: :cascade do |t|
    t.string "name", limit: 30, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index "user_id, lower((name)::text)", name: "index_tags_on_user_id_and_lower_name", unique: true, nulls_not_distinct: true
    t.index ["user_id"], name: "index_tags_on_user_id"
    t.check_constraint "char_length(btrim(name::text)) >= 1 AND char_length(btrim(name::text)) <= 30", name: "tags_name_length"
  end

  create_table "users", force: :cascade do |t|
    t.string "email_address", null: false
    t.string "password_digest", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((email_address)::text)", name: "index_users_on_lower_email_address", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "item_tags", "items", on_delete: :cascade
  add_foreign_key "item_tags", "tags", on_delete: :cascade
  add_foreign_key "items", "users", on_delete: :cascade
  add_foreign_key "sessions", "users", on_delete: :cascade
  add_foreign_key "share_links", "items", on_delete: :cascade
  add_foreign_key "share_links", "tags", on_delete: :cascade
  add_foreign_key "share_links", "users", on_delete: :cascade
  add_foreign_key "tags", "users", on_delete: :cascade
end
