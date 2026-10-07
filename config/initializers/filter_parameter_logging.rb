# Be sure to restart your server when you modify this file.
#
# Symbols match parameter names that contain that text, so :passw matches
# "password" and :token matches "access_token". Rails applies this filter
# before it writes request parameters to the log.

Rails.application.config.filter_parameters += [
  :passw, :password, :email, :secret, :token, :_key, :key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc
]
