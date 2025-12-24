package {{NAME_LOWER}}

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/prebid/openrtb/v20/openrtb2"
	"github.com/prebid/prebid-server/v2/adapters"
	"github.com/prebid/prebid-server/v2/config"
	"github.com/prebid/prebid-server/v2/errortypes"
	"github.com/prebid/prebid-server/v2/openrtb_ext"
)

type adapter struct {
	endpoint string
}

// Builder builds a new instance of the {{NAME}} adapter
func Builder(bidderName openrtb_ext.BidderName, config config.Adapter, server config.Server) (adapters.Bidder, error) {
	bidder := &adapter{
		endpoint: config.Endpoint,
	}
	return bidder, nil
}

// MakeRequests creates the HTTP requests for the bidder
func (a *adapter) MakeRequests(request *openrtb2.BidRequest, reqInfo *adapters.ExtraRequestInfo) ([]*adapters.RequestData, []error) {
	var errors []error

	// Validate request
	if len(request.Imp) == 0 {
		return nil, []error{&errortypes.BadInput{Message: "No impressions in request"}}
	}

	// Process each impression
	for i := range request.Imp {
		imp := &request.Imp[i]
		
		// Extract bidder params
		var bidderExt adapters.ExtImpBidder
		if err := json.Unmarshal(imp.Ext, &bidderExt); err != nil {
			errors = append(errors, &errortypes.BadInput{
				Message: fmt.Sprintf("Error unmarshalling imp.ext: %s", err.Error()),
			})
			continue
		}

		var impExt openrtb_ext.ExtImp{{NAME}}
		if err := json.Unmarshal(bidderExt.Bidder, &impExt); err != nil {
			errors = append(errors, &errortypes.BadInput{
				Message: fmt.Sprintf("Error unmarshalling bidder ext: %s", err.Error()),
			})
			continue
		}

		// TODO: Transform impression based on bidder params
	}

	// Serialize request
	reqJSON, err := json.Marshal(request)
	if err != nil {
		return nil, []error{err}
	}

	// Create HTTP request
	headers := http.Header{}
	headers.Add("Content-Type", "application/json;charset=utf-8")
	headers.Add("Accept", "application/json")

	return []*adapters.RequestData{
		{
			Method:  "POST",
			Uri:     a.endpoint,
			Body:    reqJSON,
			Headers: headers,
			ImpIDs:  openrtb_ext.GetImpIDs(request.Imp),
		},
	}, errors
}

// MakeBids unpacks the server's response into Bids
func (a *adapter) MakeBids(request *openrtb2.BidRequest, requestData *adapters.RequestData, response *adapters.ResponseData) (*adapters.BidderResponse, []error) {
	if response.StatusCode == http.StatusNoContent {
		return nil, nil
	}

	if response.StatusCode == http.StatusBadRequest {
		return nil, []error{&errortypes.BadInput{
			Message: fmt.Sprintf("Bad request: %s", string(response.Body)),
		}}
	}

	if response.StatusCode != http.StatusOK {
		return nil, []error{&errortypes.BadServerResponse{
			Message: fmt.Sprintf("Unexpected status code: %d", response.StatusCode),
		}}
	}

	var bidResp openrtb2.BidResponse
	if err := json.Unmarshal(response.Body, &bidResp); err != nil {
		return nil, []error{&errortypes.BadServerResponse{
			Message: fmt.Sprintf("Error unmarshalling response: %s", err.Error()),
		}}
	}

	bidResponse := adapters.NewBidderResponseWithBidsCapacity(len(request.Imp))

	for _, seatBid := range bidResp.SeatBid {
		for i := range seatBid.Bid {
			bid := &seatBid.Bid[i]
			
			bidType, err := getBidType(bid, request.Imp)
			if err != nil {
				continue
			}

			bidResponse.Bids = append(bidResponse.Bids, &adapters.TypedBid{
				Bid:     bid,
				BidType: bidType,
			})
		}
	}

	return bidResponse, nil
}

func getBidType(bid *openrtb2.Bid, imps []openrtb2.Imp) (openrtb_ext.BidType, error) {
	// Find matching impression
	for _, imp := range imps {
		if imp.ID == bid.ImpID {
			if imp.Banner != nil {
				return openrtb_ext.BidTypeBanner, nil
			}
			if imp.Video != nil {
				return openrtb_ext.BidTypeVideo, nil
			}
			if imp.Native != nil {
				return openrtb_ext.BidTypeNative, nil
			}
		}
	}
	return "", fmt.Errorf("could not determine bid type for imp %s", bid.ImpID)
}
