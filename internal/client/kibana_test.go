package client

import "testing"

func TestKibanaURLFromElasticsearchURL(t *testing.T) {
	tests := []struct {
		name    string
		esURL   string
		want    string
		wantErr bool
	}{
		{
			name:  "found-io style with port",
			esURL: "https://abc123.es.us-east-1.aws.found.io:9243",
			want:  "https://abc123.kb.us-east-1.aws.found.io:9243",
		},
		{
			name:  "elastic-cloud style no port",
			esURL: "https://my-deploy.es.eu-west-1.aws.elastic-cloud.com",
			want:  "https://my-deploy.kb.eu-west-1.aws.elastic-cloud.com",
		},
		{
			name:    "non cloud host cannot derive",
			esURL:   "https://testing.invalid:9200",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := kibanaURLFromElasticsearchURL(tt.esURL)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (url=%q)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("want %q, got %q", tt.want, got)
			}
		})
	}
}
