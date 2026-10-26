package app

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/jackc/pgx/v5"
)

//go:embed fonts/DejaVuSansCondensed.ttf
var receiptFont []byte

// Fare and participant facts are frozen at completion. Payment/refund facts are
// explicitly a separate, dated annotation: a completed trip is not proof of payment.
func ensureTripStatement(ctx context.Context, tx pgx.Tx, id string) error {
	_, e := tx.Exec(ctx, `INSERT INTO trip_statements(ride_id,details)
 SELECT r.id,jsonb_build_object('ride_id',r.id,'rider_name',a.name,'driver_name',COALESCE(da.name,''),
 'vehicle_number',COALESCE(d.vehicle_number,''),'vehicle_category',q.vehicle_category,
 'pickup',q.pickup_label,'dropoff',q.dropoff_label,'booked_at',r.created_at,'completed_at',r.completed_at,
 'quoted_meters',q.meters,'covered_meters',r.covered_meters,'quoted_seconds',q.seconds,
 'quoted_fare_paise',q.fare_paise,'gross_paise',COALESCE(r.offered_fare_paise,q.fare_paise),
 'discount_paise',q.discount_paise,'total_paise',GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise),
 'wait_charge_paise',r.wait_charge_paise,'payment_method',r.payment_method,
 'company_name',COALESCE(p.company_name,''),'business_gstin',COALESCE(p.business_gstin,''),
 'cost_centre',COALESCE(p.cost_centre,''),'work_email',COALESCE(p.work_email,''))
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts a ON a.id=r.rider_id
 LEFT JOIN accounts da ON da.id=r.driver_id LEFT JOIN drivers d ON d.user_id=r.driver_id
 LEFT JOIN account_profiles p ON p.account_id=r.rider_id WHERE r.id=$1 AND r.status='completed'
 ON CONFLICT(ride_id) DO NOTHING`, id)
	return e
}

func paymentDescription(status string) string {
	switch status {
	case "paid_online":
		return "Online payment confirmed by payment provider"
	case "paid_wallet":
		return "Paid from Hop wallet"
	case "driver_reported_received":
		return "Captain reported payment received (cash / direct UPI; not bank-verified)"
	case "rider_disputed":
		return "Payment disputed — support review required"
	default:
		return "Payment unconfirmed — this statement is not proof of payment"
	}
}
func receiptPDF(details map[string]any, issued time.Time, status string, refund int64) ([]byte, error) {
	p := fpdf.New("P", "mm", "A4", "")
	p.SetMargins(18, 18, 18)
	p.SetAutoPageBreak(true, 18)
	p.AddUTF8FontFromBytes("Hop", "", receiptFont)
	p.AddPage()
	p.SetFont("Hop", "", 20)
	p.CellFormat(174, 12, "Hop · Trip statement", "", 1, "L", false, 0, "")
	p.SetFont("Hop", "", 9)
	p.MultiCell(174, 5, "A travel expense record, not a GST tax invoice. Employer reimbursement is subject to its policy.", "", "L", false)
	p.Ln(4)
	val := func(key string) string {
		v := details[key]
		if v == nil {
			return ""
		}
		return fmt.Sprint(v)
	}
	line := func(label, value string) {
		if value == "" {
			return
		}
		p.SetFont("Hop", "", 10)
		p.MultiCell(174, 6, label+": "+value, "", "L", false)
	}
	line("Statement", "HOP-"+strings.ToUpper(val("ride_id")))
	line("Issued", issued.In(time.FixedZone("IST", 19800)).Format("02 Jan 2006, 15:04 IST"))
	for _, pair := range [][2]string{{"Rider", "rider_name"}, {"Captain", "driver_name"}, {"Vehicle registration", "vehicle_number"}, {"Vehicle category", "vehicle_category"}, {"Pickup", "pickup"}, {"Destination", "dropoff"}} {
		line(pair[0], val(pair[1]))
	}
	for _, pair := range [][2]string{{"Booked", "booked_at"}, {"Completed", "completed_at"}} {
		v := val(pair[1])
		if t, e := time.Parse(time.RFC3339Nano, v); e == nil {
			v = t.In(time.FixedZone("IST", 19800)).Format("02 Jan 2006, 15:04 IST")
		}
		line(pair[0], v)
	}
	meters := num(details["quoted_meters"])
	basis := "quoted route"
	if v := num(details["covered_meters"]); v > 0 {
		meters = v
		basis = "adjusted covered distance"
	}
	line("Distance", fmt.Sprintf("%.2f km (%s)", meters/1000, basis))
	line("Estimated trip duration", fmt.Sprintf("%.0f minutes (quote)", num(details["quoted_seconds"])/60))
	p.Ln(4)
	amount := func(label string, paise int64) { line(label, fmt.Sprintf("INR %.2f", float64(paise)/100)) }
	quoted, gross := int64(num(details["quoted_fare_paise"])), int64(num(details["gross_paise"]))
	amount("Quoted fare", quoted)
	if gross != quoted {
		amount("Fare adjustment (includes applicable waiting / negotiation / early finish)", gross-quoted)
	}
	if discount := int64(num(details["discount_paise"])); discount > 0 {
		amount("Discount", -discount)
	}
	amount("Total fare", int64(num(details["total_paise"])))
	if wait := int64(num(details["wait_charge_paise"])); wait > 0 {
		amount("Waiting charge already included in total", wait)
	}
	p.Ln(3)
	line("Payment method at completion", strings.ToUpper(val("payment_method")))
	description := paymentDescription(status)
	if val("payment_method") == "wallet" && status == "paid_online" {
		description = "Paid from Hop wallet"
	}
	line("Payment status at download", description)
	if refund > 0 {
		amount("Refunds recorded to date", refund)
		line("Refund note", "Original trip fare is preserved; refunds are separate adjustments.")
	}
	for _, pair := range [][2]string{{"Business", "company_name"}, {"Business GSTIN (provided by rider)", "business_gstin"}, {"Cost centre / project", "cost_centre"}, {"Work email (provided by rider)", "work_email"}} {
		line(pair[0], val(pair[1]))
	}
	p.Ln(5)
	p.SetFont("Hop", "", 8)
	p.MultiCell(174, 5, "Generated by Hop from its trip records. No GST tax amount is asserted by this document. For a legally applicable supplier tax invoice or corrections, contact support from the trip. Captain-reported direct payments have not been independently verified by Hop. Payment and refund annotations reflect records at download time.", "", "L", false)
	line("Downloaded", time.Now().UTC().Format(time.RFC3339))
	var out bytes.Buffer
	e := p.Output(&out)
	return out.Bytes(), e
}
func (s *Server) tripReceipt(w http.ResponseWriter, r *http.Request) {
	id, uid, ctx := r.PathValue("id"), user(r).Account.ID, r.Context()
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "Trip not found")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var status, payment, riderID string
	e = tx.QueryRow(ctx, "SELECT status,payment_status,rider_id::text FROM rides WHERE id=$1 AND (rider_id=$2 OR driver_id=$2) FOR SHARE", id, uid).Scan(&status, &payment, &riderID)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Trip not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "completed" {
		fail(w, 409, "Trip statement is available after completion")
		return
	}
	if e = ensureTripStatement(ctx, tx, id); e != nil {
		dbError(w, e)
		return
	}
	var raw []byte
	var issued time.Time
	var refunded int64
	if e = tx.QueryRow(ctx, "SELECT details,issued_at FROM trip_statements WHERE ride_id=$1", id).Scan(&raw, &issued); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.QueryRow(ctx, "SELECT COALESCE(sum(amount_paise),0) FROM refunds WHERE ride_id=$1", id).Scan(&refunded); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	var details map[string]any
	if e = json.Unmarshal(raw, &details); e != nil {
		dbError(w, e)
		return
	}
	if uid != riderID {
		for _, key := range []string{"company_name", "business_gstin", "cost_centre", "work_email"} {
			delete(details, key)
		}
	}
	pdf, e := receiptPDF(details, issued, payment, refunded)
	if e != nil {
		fail(w, 500, "Could not create trip statement")
		return
	}
	description := paymentDescription(payment)
	if details["payment_method"] == "wallet" && payment == "paid_online" {
		description = "Paid from Hop wallet"
	}
	write(w, 200, map[string]any{"details": details, "issued_at": issued, "payment_status": payment, "payment_description": description, "refunded_paise": refunded, "filename": "hop-trip-" + id + ".pdf", "content_type": "application/pdf", "pdf": base64.StdEncoding.EncodeToString(pdf)})
}
