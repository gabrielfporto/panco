// Apenas para typecheck do workspace Node; Deno fornece estes globals no runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
