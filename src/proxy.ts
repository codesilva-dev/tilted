import { NextRequest, NextResponse } from "next/server";

export default function proxy(req: NextRequest) {
    // this middleware does nothing currently
    return NextResponse.next();
}