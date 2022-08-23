import clsx from "clsx";

export function Spinner(props: JSX.IntrinsicElements["div"]) {
    const { className, ...rest } = props;
    return <div style={{ borderTopColor: "transparent" }} className={clsx("min-w-[2.5rem] min-h-[2.5rem] border-4 border-white border-solid rounded-full animate-spin", className)} {...rest} />;
}
