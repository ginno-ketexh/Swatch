require "vips"

# Stay inside the free instance's memory, and refuse every image loader
# except the four formats Swatch accepts.
Vips.block_untrusted(true)
Vips.concurrency_set(1)
Vips.cache_set_max(0)
Vips.cache_set_max_mem(64 * 1024 * 1024)
Vips.cache_set_max_files(0)
Vips.block("VipsForeignLoad", true)
# libvips 8.15 names the GIF loader VipsForeignLoadNsgif, not VipsForeignLoadGif.
%w[VipsForeignLoadJpeg VipsForeignLoadPng VipsForeignLoadWebp VipsForeignLoadNsgif].each do |loader|
  Vips.block(loader, false)
end
