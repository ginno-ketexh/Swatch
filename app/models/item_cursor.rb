class ItemCursor
  MAX_LENGTH = 512

  def self.encode(item, sort)
    payload = { "sort" => sort, "id" => item.id }
    case sort
    when "az"
      payload["title"] = item.title.to_s.downcase
    else
      payload["created_at"] = item.created_at.iso8601(6)
    end
    Base64.urlsafe_encode64(payload.to_json, padding: false)
  end

  def self.decode(cursor, sort)
    raw = cursor.to_s
    return nil if raw.blank? || raw.length > MAX_LENGTH

    padded = raw + ("=" * ((4 - (raw.length % 4)) % 4))
    data = JSON.parse(Base64.urlsafe_decode64(padded))
    return nil unless data["sort"] == sort

    id = Integer(data.fetch("id"))
    if sort == "az"
      { title: data.fetch("title").to_s, id: id }
    else
      { created_at: Time.zone.iso8601(data.fetch("created_at")), id: id }
    end
  rescue ArgumentError, JSON::ParserError, TypeError, KeyError
    nil
  end

  def self.encode_for_link(link, item)
    payload = { "id" => item.id, "created_at" => item.created_at.iso8601(6) }
    Rails.application.message_verifier("share-item-cursor").generate(payload, purpose: "share:#{link.id}")
  end

  def self.decode_for_link(link, token)
    raw = token.to_s
    return nil if raw.blank? || raw.length > MAX_LENGTH

    data = Rails.application.message_verifier("share-item-cursor").verify(raw, purpose: "share:#{link.id}")
    {
      created_at: Time.zone.iso8601(data.fetch("created_at")),
      id: Integer(data.fetch("id"))
    }
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ArgumentError, TypeError, KeyError
    nil
  end
end
