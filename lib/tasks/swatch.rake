namespace :swatch do
  desc "Create the first owner and attach existing swatches"
  task bootstrap_owner: :environment do
    OwnerBootstrap.call!
  rescue OwnerBootstrap::Error => error
    abort error.message
  end

  desc "Replace the owner password. The new password is not shown as you type."
  task reset_owner_password: :environment do
    require "io/console"

    abort "No owner account exists yet." if User.none?

    $stdout.print "New password: "
    $stdout.flush
    password = $stdin.noecho(&:gets).to_s.chomp
    $stdout.puts
    ENV["OWNER_NEW_PASSWORD"] = password
    OwnerBootstrap.call!
  rescue OwnerBootstrap::Error => error
    abort error.message
  end
end
