class AddImageAltToItems < ActiveRecord::Migration[8.1]
  def change
    add_column :items, :image_alt, :string, limit: 250
    add_check_constraint :items,
      "image_alt IS NULL OR char_length(image_alt) <= 250",
      name: "items_image_alt_length"
  end
end
