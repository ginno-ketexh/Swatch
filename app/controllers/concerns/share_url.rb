module ShareUrl
  extend ActiveSupport::Concern

  private
    def share_origin
      ENV["RENDER_EXTERNAL_URL"].presence || request.base_url
    end

    def share_absolute(path)
      "#{share_origin.to_s.chomp("/")}#{path}"
    end

    def share_link_url(link)
      share_absolute(public_share_path(link.token))
    end
end
