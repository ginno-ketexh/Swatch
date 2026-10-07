require "test_helper"

class HomeTest < ActionDispatch::IntegrationTest
  test "home page names the app and shows the version" do
    get root_path, headers: owner_headers

    assert_response :success
    assert_select "html[lang=en]"
    assert_select "title", "Swatch"
    assert_select "header"
    assert_select "main#main"
    assert_select "h1", "Swatch"
    assert_select "#root[data-version=?]", Swatch::VERSION
    assert_match "Version #{Swatch::VERSION}", response.body
    # Colors and fonts stay in the stylesheet tokens, not in the markup.
    assert_no_match(/#[0-9a-fA-F]{3,8}/, response.body)
  end
end
