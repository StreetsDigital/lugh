package {{NAME_LOWER}}

import (
	"testing"

	"github.com/prebid/prebid-server/v2/adapters/adapterstest"
	"github.com/prebid/prebid-server/v2/config"
	"github.com/prebid/prebid-server/v2/openrtb_ext"
)

func TestJsonSamples(t *testing.T) {
	bidder, buildErr := Builder(
		openrtb_ext.Bidder{{NAME}},
		config.Adapter{Endpoint: "https://example.com/bid"},
		config.Server{},
	)

	if buildErr != nil {
		t.Fatalf("Builder returned unexpected error: %v", buildErr)
	}

	adapterstest.RunJSONBidderTest(t, "{{NAME_LOWER}}", bidder)
}
