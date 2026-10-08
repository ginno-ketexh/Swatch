class CreateSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :ip_address
      t.string :user_agent, limit: 255
      t.datetime :expires_at, null: false
      t.datetime :last_seen_at, null: false
      t.boolean :remember, null: false, default: false

      t.timestamps
    end

    add_index :sessions, :expires_at
  end
end
