class_name HomeData
extends RefCounted
## All the homes feature's data files read once: prices, home types, props and listings.
## Plain data, safe to load on a worker thread.

var prices: HomePrices
var homes: HomeCatalog
var props: PropCatalog
var listings: HomeListings


static func load_all() -> HomeData:
	var d := HomeData.new()
	d.prices = HomePrices.load_file()
	d.homes = HomeCatalog.load_file()
	d.props = PropCatalog.load_file()
	d.listings = HomeListings.load_file()
	return d


## "" when everything loaded, else what failed.
func error() -> String:
	var parts := PackedStringArray()
	for e: String in [prices.error, homes.error, props.error, listings.error]:
		if e != "":
			parts.append(e)
	return "; ".join(parts)
