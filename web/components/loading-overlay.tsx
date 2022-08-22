import { Row } from "./layout/row";

export function LoadingOverlay(props: { visible: boolean; message: string; loading: boolean }) {
    const { visible, message, loading } = props;
    return (
        visible && (
            <div className="absolute inset-0 flex justify-center items-center bg-gray-500 bg-opacity-75 z-50">
                <Row className="justify-center grow animate-fade items-center gap-4">
                    {loading && <div style={{ borderTopColor: "transparent" }} className="w-10 h-10 border-4 border-white border-solid rounded-full animate-spin" />}
                    <div className="text-white">{message}</div>
                </Row>
            </div>
        )
    );
}
