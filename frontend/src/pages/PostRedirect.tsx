import { Navigate, useLocation } from "react-router-dom";
/** /letters was merged into the Post page. Old links keep working, with ?to= and ?at= carried over. */
export function PostRedirect() { const { search } = useLocation(); return <Navigate to={`/pms${search}`} replace />; }
