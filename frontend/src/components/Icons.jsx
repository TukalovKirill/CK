import journalSvg from "../assets/journal-text.svg";
import trophySvg from "../assets/trophy.svg";
import shopSvg from "../assets/small-shop-alt.svg";
import cashSvg from "../assets/cash.svg";
import bellSvg from "../assets/bell.svg";
import logoutSvg from "../assets/logout.svg";
import buildingSvg from "../assets/building.svg";
import userSvg from "../assets/user-profile.svg";

function MaskIcon({ src, size = 20, color, className = "" }) {
  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color || "currentColor",
        WebkitMaskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${src})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}

export function TextbookIcon(props) {
  return <MaskIcon src={journalSvg} {...props} />;
}

export function QuizIcon(props) {
  return <MaskIcon src={trophySvg} {...props} />;
}

export function ShopIcon(props) {
  return <MaskIcon src={shopSvg} {...props} />;
}

export function CompanyIcon(props) {
  return <MaskIcon src={buildingSvg} {...props} />;
}

export function ProfileIcon(props) {
  return <MaskIcon src={userSvg} {...props} />;
}

export function CoinsIcon(props) {
  return <MaskIcon src={cashSvg} {...props} />;
}

export function BellIcon(props) {
  return <MaskIcon src={bellSvg} {...props} />;
}

export function LogOutIcon(props) {
  return <MaskIcon src={logoutSvg} {...props} />;
}
