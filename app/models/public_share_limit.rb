class PublicShareLimit
  STORE = ActiveSupport::Cache::MemoryStore.new
  MISS_LIMIT = 20
  MISS_WINDOW = 10.minutes

  # Fixed window: the expiry is written only on the first miss.
  # MemoryStore#increment keeps that expiry on later hits.
  # A missing key makes increment return nil on some cache stores,
  # so the first hit is written directly.
  def self.record_miss!(ip)
    key = "public-share-miss:#{ip}"
    existing = STORE.read(key)
    if existing.nil?
      STORE.write(key, 1, expires_in: MISS_WINDOW)
      return false
    end

    value = STORE.increment(key)
    if value.nil?
      STORE.write(key, 1, expires_in: MISS_WINDOW)
      return false
    end

    value > MISS_LIMIT
  end
end
