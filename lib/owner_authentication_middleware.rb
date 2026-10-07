class OwnerAuthenticationMiddleware
  def initialize(app)
    @app = app
  end

  def call(env)
    request = ActionDispatch::Request.new(env)
    return @app.call(env) if request.path == "/up" || OwnerGate.allow?(request)

    body = "Authentication required"
    [ 401, {
      "Content-Type" => "text/plain; charset=utf-8",
      "Content-Length" => body.bytesize.to_s,
      "WWW-Authenticate" => 'Basic realm="Swatch"',
      "Cache-Control" => "no-store",
      "X-Frame-Options" => "DENY"
    }, [ body ] ]
  end
end
