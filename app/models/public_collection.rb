class PublicCollection
  PAGE_SIZE = 24

  Page = Data.define(:items, :total, :page_number, :older_after, :newer_after, :show_newer)

  def self.page(link, after_param)
    new(link, after_param).page
  end

  def self.preview_item(link)
    scope_for(link).joins(:image_attachment).order(created_at: :desc, id: :desc).first
  end

  def self.scope_for(link)
    Item.joins(:item_tags).where(item_tags: { tag_id: link.tag_id }, user_id: link.user_id)
  end

  def initialize(link, after_param)
    @link = link
    @after_param = after_param
  end

  def page
    boundary = decoded_boundary
    scope = ordered
    if boundary
      scope = scope.where(older_than, boundary[:created_at], boundary[:id])
    end

    rows = scope.with_attached_image.limit(PAGE_SIZE + 1).to_a
    items = rows.first(PAGE_SIZE)
    total = self.class.scope_for(@link).count
    older_after = rows.size > PAGE_SIZE ? ItemCursor.encode_for_link(@link, items.last) : nil
    newer = newer_page(items)

    Page.new(
      items: items,
      total: total,
      page_number: newer[:page_number],
      older_after: older_after,
      newer_after: newer[:after],
      show_newer: newer[:page_number] > 1
    )
  end

  private
    def ordered
      self.class.scope_for(@link).order(created_at: :desc, id: :desc)
    end

    def decoded_boundary
      return if @after_param.blank?

      ItemCursor.decode_for_link(@link, @after_param)
    end

    def older_than
      "(items.created_at, items.id) < (?, ?)"
    end

    def newer_than
      "(items.created_at, items.id) > (?, ?)"
    end

    def newer_page(items)
      first = items.first
      return { page_number: 1, after: nil } unless first

      newer = self.class.scope_for(@link).where(newer_than, first.created_at, first.id)
      count = newer.count
      page_number = (count / PAGE_SIZE) + 1
      return { page_number: page_number, after: nil } if count <= PAGE_SIZE

      cursor_item = newer.order(created_at: :asc, id: :asc).offset(PAGE_SIZE).first
      after = cursor_item ? ItemCursor.encode_for_link(@link, cursor_item) : nil
      { page_number: page_number, after: after }
    end
end
