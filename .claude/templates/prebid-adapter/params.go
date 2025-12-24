package openrtb_ext

// ExtImp{{NAME}} defines the bidder params for {{NAME}}
type ExtImp{{NAME}} struct {
	// PlacementID is the placement identifier
	PlacementID string `json:"placementId"`
	
	// SiteID is the site identifier (optional)
	SiteID string `json:"siteId,omitempty"`
	
	// TODO: Add your bidder-specific parameters here
}
