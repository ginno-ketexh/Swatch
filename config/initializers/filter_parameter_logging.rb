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
