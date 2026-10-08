# Stops an oversized image upload before Rails reads the body.
# Only the swatch image route is limited. Other requests pass through.
class ImageUploadLimit
  LIMIT = 10 * 1024 * 1024
  PATH = %r{\A/api/v1/items/\d+/image\z}

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)
    return @app.call(env) unless request.put? && request.path.match?(PATH)

    length = env["CONTENT_LENGTH"]
    if length.nil? || length.to_s.strip.empty?
      return json(411, "The upload is missing its size")
    end
    if length.to_i > LIMIT
      return json(413, "That file is bigger than 10 MB")
    end

    @app.call(env)
  end

  private
    def json(status, message)
      body = { errors: { image: [ message ] } }.to_json
      [ status, { "content-type" => "application/json; charset=utf-8", "content-length" => body.bytesize.to_s }, [ body ] ]
    end
end
