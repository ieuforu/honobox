package inspector

import (
	"embed"
	"io/fs"
)

//go:embed all:webdist
var assets embed.FS

func Assets() fs.FS {
	files, err := fs.Sub(assets, "webdist")
	if err != nil {
		panic(err)
	}
	return files
}
