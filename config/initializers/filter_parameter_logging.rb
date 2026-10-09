# Be sure to restart your server when you modify this file.
#
# Symbols match parameter names that contain that text, so :passw matches
# "password" and :token matches "access_token". Rails applies this filter
# before it writes request parameters to the log.

Rails.application.config.filter_parameters += [
  :passw, :password, :email, :secret, :token, :_key, :key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc,
  :access_key_id, :secret_access_key, :r2_access_key_id, :r2_secret_access_key, :r2_account_id, :r2_bucket
]

# Presigned image links must not appear in the redirect log.
Rails.application.config.filter_redirect += [ /r2\.cloudflarestorage\.com/, /X-Amz-Signature/ ]

# Share tokens sit in the path (/s/<token>), which filter_parameters does
# not touch. The Started line uses filtered_path, so blank that segment.
module Swatch
  module FilterShareTokenPath
    PATTERN = %r{/s/[1-9A-HJ-NP-Za-km-z]{36}}

    def filtered_path
      super.gsub(PATTERN, "/s/[FILTERED]")
    end
  end
end

unless ActionDispatch::Request.ancestors.include?(Swatch::FilterShareTokenPath)
  ActionDispatch::Request.prepend(Swatch::FilterShareTokenPath)
end
