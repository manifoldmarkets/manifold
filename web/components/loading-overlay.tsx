import clsx from "clsx";
import { Row } from "./layout/row";

export function LoadingOverlay(props: { visible: boolean; message: string; loading: boolean, className?: string }) {
    const { visible, message, loading, className } = props;
    return (
        visible && (
            <div className={clsx("absolute inset-0 flex justify-center items-center bg-gray-500 bg-opacity-75 z-[9999]", className)}>
                <Row className={clsx("justify-center grow animate-fade items-center gap-4 p-6", loading ? "text-left" : "text-center")}>
                    {loading && <div style={{ borderTopColor: "transparent" }} className="min-w-[2.5rem] min-h-[2.5rem] border-4 border-white border-solid rounded-full animate-spin" />}
                    <div className="text-white">{message}</div>
                </Row>
            </div>
        )
    );
}
