# Used only when production has no R2 settings. It never writes to disk.
class ActiveStorage::Service::OffService < ActiveStorage::Service
  def initialize(**)
    @public = false
  end

  def upload(*, **)
    refuse
  end

  def download(*, **)
    refuse
  end

  def download_chunk(*, **)
    refuse
  end

  def delete(*, **)
  end

  def delete_prefixed(*, **)
  end

  def exist?(*, **)
    false
  end

  def url(*, **)
    refuse
  end

  def url_for_direct_upload(*, **)
    refuse
  end

  def headers_for_direct_upload(*, **)
    {}
  end

  private
    def refuse
      raise Swatch::ImageStorage::Unavailable, "Image uploads aren't set up yet"
    end
end
