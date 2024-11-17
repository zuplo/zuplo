package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Problem represents a Problem JSON response according to RFC 7807
type Problem struct {
	Type     string `json:"type,omitempty"`     // A URI reference to identify the problem type
	Title    string `json:"title"`              // A short, human-readable summary of the problem
	Status   int    `json:"status"`             // HTTP status code
	Detail   string `json:"detail,omitempty"`   // A detailed explanation of the error
	Instance string `json:"instance,omitempty"` // A URI reference to the specific occurrence of the problem
}

func writeProblemJSON(w http.ResponseWriter, status int, problem Problem) {
	problem.Status = status
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ") // Indentation with 2 spaces
	encoder.Encode(problem)
}

func main() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	http.HandleFunc("/echo", func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"body":    parseBody(r),
			"headers": r.Header,
			"url":     r.URL.String(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/sleep/{ms}", func(w http.ResponseWriter, r *http.Request) {
		sleepStr := r.PathValue("ms")
		sleepMs, _ := strconv.Atoi(sleepStr)
		if sleepMs < 0 || sleepMs > 20000 {
			writeProblemJSON(w, http.StatusBadRequest, Problem{
				Type:   "https://httpproblems.com/http-status/400",
				Title:  "Bad Request",
				Detail: fmt.Sprintf("The value for 'sleep' must be a positive integer less than %d.", 20000),
			})
			return
		}
		time.Sleep(time.Duration(sleepMs) * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "Slept for %d ms", sleepMs)
	})

	http.HandleFunc("/pi/{digits}", func(w http.ResponseWriter, r *http.Request) {
		digitsStr := r.PathValue("digits")
		digits, _ := strconv.Atoi(digitsStr)
		if digits < 1 {
			digits = 1
		}
		if digits < 1 || digits > 20000 {
			writeProblemJSON(w, http.StatusBadRequest, Problem{
				Type:   "https://httpproblems.com/http-status/400",
				Title:  "Bad Request",
				Detail: fmt.Sprintf("The value for 'digits' must be a positive integer less than %d.", 20000),
			})
			return
		}
		pi := CalculatePi(digits)
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "%s", pi)
	})

	http.HandleFunc("/large/{size}", func(w http.ResponseWriter, r *http.Request) {
		sizeStr := r.PathValue("size")
		size, _ := strconv.Atoi(sizeStr)
		if size < 1 || size > 200000000 {
			writeProblemJSON(w, http.StatusBadRequest, Problem{
				Type:   "https://httpproblems.com/http-status/400",
				Title:  "Bad Request",
				Detail: fmt.Sprintf("The value for 'digits' must be a positive integer less than %d.", 20000),
			})
			return
		}
		randomText := generateRandomText(size)
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(randomText))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("Server started on " + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func parseBody(r *http.Request) map[string]interface{} {
	defer r.Body.Close()
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		body = map[string]interface{}{"error": "invalid JSON body"}
	}
	return body
}

// CalculatePi calculates Pi to n decimal digits using the Chudnovsky algorithm.
func CalculatePi(n int) string {
	precision := uint(n*4 + 10) // Extra precision to ensure accuracy after rounding
	one := big.NewInt(1)

	// Precompute constants
	k := new(big.Int)
	kFactorial := big.NewInt(1)
	numerator := big.NewInt(13591409)
	denominator := big.NewInt(1)

	sum := new(big.Rat).SetFrac(big.NewInt(13591409), one)
	multiplier := big.NewInt(-262537412640768000)

	for i := 1; i <= (n/14)+1; i++ {
		// k = 6i - 5
		k.Mul(big.NewInt(6), big.NewInt(int64(i)))
		k.Sub(k, big.NewInt(5))
		kFactorial.Mul(kFactorial, k)

		// k = 2i - 1
		k.Mul(big.NewInt(2), big.NewInt(int64(i)))
		k.Sub(k, one)
		kFactorial.Mul(kFactorial, k)

		// k = 6i - 1
		k.Mul(big.NewInt(6), big.NewInt(int64(i)))
		k.Sub(k, big.NewInt(1))
		kFactorial.Mul(kFactorial, k)

		// Update numerator
		numerator.Mul(numerator, big.NewInt(545140134))
		numerator.Add(numerator, big.NewInt(13591409))

		// Update denominator
		denominator.Mul(denominator, multiplier)

		// Add term to sum
		term := new(big.Rat).SetFrac(numerator, denominator)
		term.Mul(term, new(big.Rat).SetFrac(one, kFactorial))
		sum.Add(sum, term)
	}

	// Compute Pi
	c := new(big.Float).SetPrec(precision).SetInt(big.NewInt(426880))
	sqrt := new(big.Float).SetPrec(precision).SetInt(big.NewInt(10005))
	sqrt.Sqrt(sqrt)
	c.Mul(c, sqrt)

	pi := new(big.Float).SetPrec(precision)
	pi.SetRat(sum)
	pi.Quo(c, pi)

	// Convert to string with n decimal places
	piStr := pi.Text('f', n)
	return piStr
}

func generateRandomText(size int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	var builder strings.Builder
	builder.Grow(size)
	for i := 0; i < size; i++ {
		builder.WriteByte(charset[rand.Intn(len(charset))])
	}
	return builder.String()
}
