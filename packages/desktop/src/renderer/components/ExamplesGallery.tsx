import { Globe, Server, X } from "lucide-react";

interface ExamplesGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExample: (example: string) => void;
}

interface ExampleItem {
  text: string;
  label: string;
}

const WEB_EXAMPLES: ExampleItem[] = [
  {
    label: "E-commerce shopping flow",
    text: `Navigate to https://graphcommerce.vercel.app/
Select Women category
Select 2 random products and random size
Add to cart
View the cart
Checkout and then stop
Do not go for payment`,
  },
  {
    label: "Search and verify results",
    text: `Navigate to https://www.google.com
Search for "OpenAI GPT"
Verify that search results are displayed
Verify that at least one result links to openai.com`,
  },
  {
    label: "Form fill and submit",
    text: `Navigate to https://demoqa.com/automation-practice-form
Fill in Name: John Doe
Fill in Email: john@test.com
Select Gender: Male
Enter Mobile: 1234567890
Click Submit
Verify the confirmation modal appears`,
  },
];

const API_EXAMPLES: ExampleItem[] = [
  {
    label: "GET request with query parameters",
    text: `Given the base URL is "https://httpbin.org"
When I send a GET request to "/get" with parameters:
  | foo  | bar |
  | test | 123 |
Then the response status code should be 200
And the response body should contain "args" with "foo" as "bar"`,
  },
  {
    label: "POST request with JSON body",
    text: `Send a POST request to https://httpbin.org/post with JSON body:
{
  "name": "John Doe",
  "age": 30
}
Set Content-Type header to application/json
Verify the response status is 200
Verify the "json" field in the response matches the input body`,
  },
  {
    label: "HTTP Basic Authentication",
    text: `Given I use basic authentication with username "user" and password "passwd"
When I send a GET request to "https://httpbin.org/basic-auth/user/passwd"
Then the response status code should be 200
And the response body should contain "authenticated": true`,
  },
  {
    label: "HTTP status code handling",
    text: `Send a GET request to https://httpbin.org/status/404
Verify the response status is 404
Then send a GET to https://httpbin.org/status/200
Verify the response status is 200
Then send a GET to https://httpbin.org/status/500
Verify the response status is 500`,
  },
  {
    label: "Custom request headers",
    text: `Given I set the "X-Custom-Header" header to "MyValue"
When I send a GET request to "https://httpbin.org/headers"
Then the response status code should be 200
And the response body should include "X-Custom-Header" with value "MyValue"`,
  },
  {
    label: "Response delay testing",
    text: `Send a GET request to https://httpbin.org/delay/3
Verify the response takes approximately 3 seconds
Verify the response status is 200
Verify the response body contains the "url" field`,
  },
];

export function ExamplesGallery({ isOpen, onClose, onSelectExample }: ExamplesGalleryProps) {
  if (!isOpen) return null;

  const handleSelect = (text: string) => {
    onSelectExample(text);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Example Tasks</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Web Examples */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={18} className="text-accent" />
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                Web UI Testing
              </h3>
            </div>
            <div className="space-y-2">
              {WEB_EXAMPLES.map((example, idx) => (
                <button
                  key={`web-${idx}`}
                  onClick={() => handleSelect(example.text)}
                  className="w-full text-left p-3 bg-surface-2 hover:bg-accent/10 border border-border hover:border-accent/50 rounded-lg transition-colors group"
                >
                  <div className="text-sm font-medium text-text group-hover:text-accent mb-1">
                    {example.label}
                  </div>
                  <div className="text-xs text-text-muted group-hover:text-accent/80 font-mono line-clamp-2">
                    {example.text.split("\n")[0]}...
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* API Examples */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Server size={18} className="text-success" />
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                API Testing
              </h3>
            </div>
            <div className="space-y-2">
              {API_EXAMPLES.map((example, idx) => (
                <button
                  key={`api-${idx}`}
                  onClick={() => handleSelect(example.text)}
                  className="w-full text-left p-3 bg-surface-2 hover:bg-success/10 border border-border hover:border-success/50 rounded-lg transition-colors group"
                >
                  <div className="text-sm font-medium text-text group-hover:text-success mb-1">
                    {example.label}
                  </div>
                  <div className="text-xs text-text-muted group-hover:text-success/80 font-mono line-clamp-2">
                    {example.text.split("\n")[0]}...
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border text-center">
          <p className="text-xs text-text-muted">
            Click an example to use it as your test input
          </p>
        </div>
      </div>
    </div>
  );
}
