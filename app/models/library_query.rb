class LibraryQuery
  SORTS = %w[newest oldest az].freeze
  MAX_WORDS = 8
  MAX_QUERY = 100
  MAX_TAGS = 5

  Result = Struct.new(:items, :next_cursor, :total_count, :ignored_tags, :error, keyword_init: true)

  def initialize(params)
    @params = params
  end

  def call
    if (problem = validation_error)
      return Result.new(items: [], next_cursor: nil, total_count: 0, ignored_tags: [], error: problem)
    end

    filtered = filtered_scope
    total = filtered.count
    scope = ordered(filtered)

    if @params[:cursor].present?
      decoded = ItemCursor.decode(@params[:cursor], sort)
      unless decoded
        return Result.new(
          items: [],
          next_cursor: nil,
          total_count: 0,
          ignored_tags: ignored_tags,
          error: { cursor: [ "is invalid" ] }
        )
      end
      scope = apply_cursor(scope, decoded)
    end

    limit = page_size
    rows = scope.preload(:tags).limit(limit + 1).to_a
    page = rows.first(limit)
    next_cursor = rows.size > limit ? ItemCursor.encode(page.last, sort) : nil

    Result.new(items: page, next_cursor: next_cursor, total_count: total, ignored_tags: ignored_tags, error: nil)
  end

  def sort
    value = @params[:sort].to_s
    SORTS.include?(value) ? value : "newest"
  end

  private
    def validation_error
      return { q: [ "is too long (maximum is 100 characters)" ] } if query_too_long?
      return { tags: [ "can filter by at most 5 tags" ] } if requested_tags.size > MAX_TAGS

      nil
    end

    def query_too_long?
      cleaned_query(raw: true).length > MAX_QUERY
    end

    def cleaned_query(raw: false)
      value = @params[:q].to_s.unicode_normalize(:nfc).gsub(/\p{Cc}/, "")
      value = value.strip.gsub(/\s+/, " ")
      return value if raw

      value
    end

    def words
      cleaned_query.split(" ").first(MAX_WORDS)
    end

    def requested_tags
      @requested_tags ||= begin
        raw = @params[:tags]
        list = case raw
        when Array then raw
        when String then raw.split(",")
        else []
        end
        list.filter_map { |name| Tag.normalize_name(name).downcase.presence }.uniq
      end
    end

    def known_tags
      @known_tags ||= if requested_tags.empty?
        []
      else
        found = Tag.where("lower(name) IN (?)", requested_tags).pluck(Arel.sql("lower(name)"))
        requested_tags & found
      end
    end

    def ignored_tags
      requested_tags - known_tags
    end

    def filtered_scope
      scope = Item.all
      words.each do |word|
        like = "%#{Item.sanitize_sql_like(word)}%"
        hex = hex_color(word)
        if hex
          scope = scope.where(
            "items.title ILIKE :like OR COALESCE(items.notes, '') ILIKE :like OR COALESCE(items.source_url, '') ILIKE :like OR items.color = :hex",
            like: like,
            hex: hex
          )
        else
          scope = scope.where(
            "items.title ILIKE :like OR COALESCE(items.notes, '') ILIKE :like OR COALESCE(items.source_url, '') ILIKE :like",
            like: like
          )
        end
      end

      if known_tags.any?
        # Select item_id explicitly. Passing the grouped relation to
        # where(id:) would match item_tags.id instead of the swatch.
        sql = Item.sanitize_sql_array([ <<~SQL.squish, known_tags, known_tags.size ])
          items.id IN (
            SELECT item_tags.item_id
            FROM item_tags
            INNER JOIN tags ON tags.id = item_tags.tag_id
            WHERE lower(tags.name) IN (?)
            GROUP BY item_tags.item_id
            HAVING COUNT(DISTINCT item_tags.tag_id) = ?
          )
        SQL
        scope = scope.where(Arel.sql(sql))
      end

      scope
    end

    def ordered(scope)
      case sort
      when "oldest"
        scope.order(created_at: :asc, id: :asc)
      when "az"
        scope.order(Arel.sql("lower(items.title) ASC, items.id ASC"))
      else
        scope.order(created_at: :desc, id: :desc)
      end
    end

    def apply_cursor(scope, decoded)
      case sort
      when "oldest"
        scope.where("(items.created_at, items.id) > (?, ?)", decoded.fetch(:created_at), decoded.fetch(:id))
      when "az"
        scope.where("(lower(items.title), items.id) > (?, ?)", decoded.fetch(:title), decoded.fetch(:id))
      else
        scope.where("(items.created_at, items.id) < (?, ?)", decoded.fetch(:created_at), decoded.fetch(:id))
      end
    end

    def hex_color(word)
      compact = word.delete_prefix("#")
      return unless /\A[0-9A-Fa-f]{6}\z/.match?(compact)

      "##{compact.upcase}"
    end

    def page_size
      raw = @params[:per_page].presence
      return 20 if raw.nil?

      value = Integer(raw, 10)
      return 20 if value <= 0

      [ value, 50 ].min
    rescue ArgumentError, TypeError
      20
    end
end
