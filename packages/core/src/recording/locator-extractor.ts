/**
 * Locator Extractor
 *
 * Extracts multiple locator strategies for DOM elements
 */

import type { CDPClient } from "../cdp/client.js";
import type { LocatorSet, ElementTarget } from "./types.js";

/**
 * Simple CSS escape function for Node.js environment
 * Escapes characters that have special meaning in CSS selectors
 */
function cssEscape(str: string): string {
  return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")
    .replace(/^(\d)/, "\\3$1 ");
}

/**
 * Locator Extractor
 *
 * Extracts multiple locator strategies for elements using CDP
 */
export class LocatorExtractor {
  private cdp: CDPClient;

  constructor(cdp: CDPClient) {
    this.cdp = cdp;
  }

  /**
   * Extract locators for an element at given coordinates
   */
  async extractAtPoint(x: number, y: number): Promise<ElementTarget | null> {
    try {
      // Get node at point
      const nodeResult = await this.cdp.send<{ backendNodeId: number; nodeId: number }>(
        "DOM.getNodeForLocation",
        { x, y, includeUserAgentShadowDOM: false }
      );

      if (!nodeResult?.backendNodeId) {
        return null;
      }

      return this.extractForNode(nodeResult.backendNodeId, nodeResult.nodeId);
    } catch (error) {
      console.error("Failed to extract locators at point:", error);
      return null;
    }
  }

  /**
   * Extract locators for a node by backend node ID
   */
  async extractForNode(
    backendNodeId: number,
    _nodeId?: number
  ): Promise<ElementTarget | null> {
    try {
      // Resolve node to get full info
      const resolveResult = await this.cdp.send<{
        object: { objectId: string };
      }>("DOM.resolveNode", { backendNodeId });

      if (!resolveResult?.object?.objectId) {
        return null;
      }

      const objectId = resolveResult.object.objectId;

      // Get element properties via Runtime.callFunctionOn
      const propsResult = await this.cdp.send<{
        result: {
          type: string;
          value?: {
            tagName: string;
            textContent: string;
            attributes: Record<string, string>;
            boundingBox: { x: number; y: number; width: number; height: number } | null;
          };
        };
      }>("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: `function() {
          const el = this;
          const attrs = {};
          for (const attr of el.attributes || []) {
            attrs[attr.name] = attr.value;
          }
          const rect = el.getBoundingClientRect();
          return {
            tagName: el.tagName?.toLowerCase() || '',
            textContent: (el.textContent || '').trim().slice(0, 100),
            attributes: attrs,
            boundingBox: rect ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            } : null
          };
        }`,
        returnByValue: true,
      });

      if (!propsResult?.result?.value) {
        return null;
      }

      const props = propsResult.result.value;

      // Generate locators
      const locators = await this.generateLocators(objectId, props.attributes, props.tagName);

      // Release object
      await this.cdp.send("Runtime.releaseObject", { objectId });

      return {
        locators,
        tagName: props.tagName,
        textContent: props.textContent || undefined,
        attributes: props.attributes,
        boundingBox: props.boundingBox || undefined,
      };
    } catch (error) {
      console.error("Failed to extract locators for node:", error);
      return null;
    }
  }

  /**
   * Generate multiple locator strategies for an element
   */
  private async generateLocators(
    objectId: string,
    attributes: Record<string, string>,
    tagName: string
  ): Promise<LocatorSet> {
    const locators: LocatorSet = {
      css: "",
      xpath: "",
    };

    // Test ID attributes (highest priority)
    const testIdAttrs = ["data-testid", "data-test", "data-cy", "data-test-id"];
    for (const attr of testIdAttrs) {
      if (attributes[attr]) {
        locators.testId = `[${attr}="${attributes[attr]}"]`;
        break;
      }
    }

    // ID attribute
    if (attributes.id) {
      locators.css = `#${cssEscape(attributes.id)}`;
    }

    // Generate CSS selector
    if (!locators.css) {
      locators.css = this.generateCSSSelector(objectId, tagName, attributes);
    }

    // Generate XPath
    locators.xpath = await this.generateXPath(objectId, tagName, attributes);

    // Text-based locator (for buttons, links)
    if (["button", "a", "label"].includes(tagName)) {
      const textResult = await this.cdp.send<{
        result: { type: string; value?: string };
      }>("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: `function() {
          return (this.textContent || '').trim().slice(0, 50);
        }`,
        returnByValue: true,
      });

      if (textResult?.result?.value) {
        locators.text = textResult.result.value;
      }
    }

    // ARIA role
    if (attributes.role) {
      locators.role = attributes.role;
    } else {
      // Implicit roles for common elements
      const implicitRoles: Record<string, string> = {
        button: "button",
        a: "link",
        input: attributes.type === "checkbox" ? "checkbox" : attributes.type === "radio" ? "radio" : "textbox",
        select: "combobox",
        textarea: "textbox",
        img: "img",
        nav: "navigation",
        main: "main",
        header: "banner",
        footer: "contentinfo",
      };
      if (implicitRoles[tagName]) {
        locators.role = implicitRoles[tagName];
      }
    }

    // Placeholder
    if (attributes.placeholder) {
      locators.placeholder = attributes.placeholder;
    }

    // Label (for form elements)
    if (["input", "select", "textarea"].includes(tagName) && attributes.id) {
      const labelResult = await this.cdp.send<{
        result: { type: string; value?: string };
      }>("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: `function() {
          const label = document.querySelector('label[for="${attributes.id}"]');
          return label ? label.textContent.trim() : null;
        }`,
        returnByValue: true,
      });

      if (labelResult?.result?.value) {
        locators.label = labelResult.result.value;
      }
    }

    return locators;
  }

  /**
   * Generate a CSS selector for the element
   */
  private generateCSSSelector(
    _objectId: string,
    tagName: string,
    attributes: Record<string, string>
  ): string {
    // Try to generate a unique selector
    const parts: string[] = [tagName];

    // Add class names (first 2)
    if (attributes.class) {
      const classes = attributes.class.split(/\s+/).filter(Boolean).slice(0, 2);
      for (const cls of classes) {
        if (!/^[0-9]/.test(cls) && !/[^a-zA-Z0-9_-]/.test(cls)) {
          parts.push(`.${cls}`);
        }
      }
    }

    // Add type for inputs
    if (tagName === "input" && attributes.type) {
      parts.push(`[type="${attributes.type}"]`);
    }

    // Add name attribute if present
    if (attributes.name) {
      parts.push(`[name="${attributes.name}"]`);
    }

    return parts.join("");
  }

  /**
   * Generate an XPath for the element
   */
  private async generateXPath(
    objectId: string,
    tagName: string,
    _attributes: Record<string, string>
  ): Promise<string> {
    // Generate XPath using Runtime evaluation
    const xpathResult = await this.cdp.send<{
      result: { type: string; value?: string };
    }>("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() {
        function getXPath(element) {
          if (element.id) {
            return '//*[@id="' + element.id + '"]';
          }
          if (element === document.body) {
            return '/html/body';
          }
          let ix = 0;
          const siblings = element.parentNode ? element.parentNode.childNodes : [];
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
              const parentPath = element.parentNode && element.parentNode !== document
                ? getXPath(element.parentNode)
                : '';
              return parentPath + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
              ix++;
            }
          }
          return '';
        }
        return getXPath(this);
      }`,
      returnByValue: true,
    });

    return xpathResult?.result?.value || `//${tagName}`;
  }
}
