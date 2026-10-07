class ItemCursor
  MAX_LENGTH = 512

  def self.encode(item)
    payload = { "created_at" => item.created_at.iso8601(6), "id" => item.id }
    Base64.urlsafe_encode64(payload.to_json, padding: false)
  end

  def self.decode(cursor)
    raw = cursor.to_s
    return nil if raw.blank? || raw.length > MAX_LENGTH

    padded = raw + ("=" * ((4 - (raw.length % 4)) % 4))
    data = JSON.parse(Base64.urlsafe_decode64(padded))
    created_at = Time.zone.iso8601(data.fetch("created_at"))
    id = Integer(data.fetch("id"))
    [ created_at, id ]
  rescue ArgumentError, JSON::ParserError, TypeError, KeyError
    nil
  end
end
