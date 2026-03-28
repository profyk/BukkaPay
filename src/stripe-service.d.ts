export declare class StripeService {
    createCustomer(email: string, userId: string): Promise<import("stripe").Stripe.Response<import("stripe").Stripe.Customer>>;
    createCheckoutSession(customerId: string, priceId: string, successUrl: string, cancelUrl: string): Promise<import("stripe").Stripe.Response<import("stripe").Stripe.Checkout.Session>>;
    createCustomerPortalSession(customerId: string, returnUrl: string): Promise<import("stripe").Stripe.Response<import("stripe").Stripe.BillingPortal.Session>>;
    getProduct(productId: string): Promise<any>;
    getSubscription(subscriptionId: string): Promise<any>;
}
export declare const stripeService: StripeService;
//# sourceMappingURL=stripe-service.d.ts.map