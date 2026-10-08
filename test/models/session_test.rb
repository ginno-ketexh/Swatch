require "test_helper"

class SessionTest < ActiveSupport::TestCase
  test "a normal session expires after 24 hours idle and a remembered one lasts 30 days" do
    idle = users(:owner).sessions.create!(remember: false, last_seen_at: Time.current)
    assert_not idle.expired?
    assert idle.expired?(25.hours.from_now)

    remembered = users(:owner).sessions.create!(
      remember: true,
      last_seen_at: 20.days.ago,
      expires_at: 10.days.from_now
    )
    assert_not remembered.expired?
    assert remembered.expired?(11.days.from_now)
  end

  test "last seen is written at most every five minutes" do
    record = users(:owner).sessions.create!(last_seen_at: 1.minute.ago)
    stamp = record.last_seen_at

    record.touch_seen!
    assert_equal stamp.to_i, record.reload.last_seen_at.to_i

    record.touch_seen!(10.minutes.from_now)
    assert_in_delta 10.minutes.from_now, record.reload.last_seen_at, 1
  end

  test "device label names the browser and system and the agent is capped" do
    record = users(:owner).sessions.create!(
      user_agent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 #{"x" * 300}"
    )

    assert_equal "Chrome on Linux", record.device_label
    assert_operator record.user_agent.length, :<=, 255

    edge = Session.new(user_agent: "Mozilla/5.0 (Windows NT 10.0) Edg/120.0 Chrome/120.0")
    assert_equal "Edge on Windows", edge.device_label
  end
end
