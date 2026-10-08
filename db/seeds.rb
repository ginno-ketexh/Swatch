# Sample library for local development only. Production and test skip this
# so a deploy never invents items and the test database stays empty.

if Rails.env.development?
  owner = User.find_or_create_by!(email_address: "owner@example.com") do |user|
    user.password = "swatch-dev-password"
  end
  OwnerBootstrap.call!(env: {})

  samples = [
    { title: "Terracotta stair", source_url: "https://example.com/stairs", notes: "Warm step colour against plaster.", color: "#7C2D24", tags: [ "brand", "colour" ] },
    { title: "Linen shadow", source_url: nil, notes: "The fold is the interesting part.", color: "#E6E0D4", tags: [] },
    { title: "Ink on paper", source_url: "https://museum.example/ink", notes: nil, color: "#1C1915", tags: [ "brand" ] },
    { title: "Morning tile", source_url: "https://tiles.example/morning", notes: "Grout line is almost the same tone as the tile.", color: nil, tags: [ "web", "tile" ] },
    { title: "Brass hinge", source_url: nil, notes: nil, color: "#8A6A2F", tags: [] },
    { title: "Olive door", source_url: "https://doors.example/olive", notes: "Matte paint, not stained wood.", color: "#3F4A2A", tags: [ "brand" ] },
    { title: "Soft plaster", source_url: "https://plaster.example/walls", notes: "Look at the patch of sun, not the wall.", color: "#D8D2C8", tags: [] },
    { title: "Night window", source_url: "https://windows.example/night", notes: nil, color: "#243044", tags: [] },
    { title: "Coral thread", source_url: nil, notes: "Thin line on a cream ground.", color: "#C45C4A", tags: [ "colour" ] },
    { title: "Library lamp", source_url: "https://lamps.example/library", notes: "Brass shade, paper glow.", color: "#C4A15A", tags: [] },
    { title: "River stone", source_url: "https://stones.example/river", notes: "Wet surface, grey-green.", color: nil, tags: [] },
    { title: "Quiet grid", source_url: "https://grids.example/quiet", notes: "Pencil lines, not a ruler.", color: "#4A5560", tags: [ "web", "brand" ] }
  ]

  samples.each do |attrs|
    tags = attrs.delete(:tags)
    item = Item.find_or_create_by!(title: attrs.fetch(:title), user: owner) do |record|
      record.assign_attributes(attrs)
    end
    item.replace_tag_names(tags) if tags
  end
end
