-- Migration: 0010_settings_site.sql
-- Tambah default setting: nama website dan endpoint download custom

INSERT OR IGNORE INTO settings (key, value) VALUES ('site_name', 'NQDRIVE');
INSERT OR IGNORE INTO settings (key, value) VALUES ('download_endpoint', 'default');
-- download_endpoint values:
--   'default'    => /:slug (e.g. /filename.ext)
--   'download'   => /download/:slug
--   'query'      => /:slug?download
--   'dl'         => /dl/:slug
--   'get'        => /get/:slug
--   'custom:xxx' => /{xxx}/:slug  (custom prefix)
