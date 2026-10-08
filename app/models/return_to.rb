class ReturnTo
  MAX_LENGTH = 2048

  def self.sanitize(value)
    raw = value.to_s
    return "/" if raw.empty? || raw.bytesize > MAX_LENGTH
    return "/" unless raw.start_with?("/")
    return "/" if raw.start_with?("//", "/\\")
    return "/" if raw.include?("\\") || raw.include?("://")
    return "/" if raw.downcase.include?("javascript:")

    path = raw.split("?", 2).first
    return "/" if path == "/sign-in"

    raw
  end
end
