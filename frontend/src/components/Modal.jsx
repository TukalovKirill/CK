import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { Fragment } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, wide }) {
    return (
        <Transition show={open} as={Fragment}>
            <Dialog onClose={onClose} className="relative z-50">
                <TransitionChild
                    as={Fragment}
                    enter="transition-opacity duration-150"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="transition-opacity duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/30" />
                </TransitionChild>

                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <TransitionChild
                        as={Fragment}
                        enter="transition-transform duration-150"
                        enterFrom="scale-95 opacity-0"
                        enterTo="scale-100 opacity-100"
                        leave="transition-transform duration-100"
                        leaveFrom="scale-100 opacity-100"
                        leaveTo="scale-95 opacity-0"
                    >
                        <DialogPanel
                            className={`bg-white border border-gray-300 rounded p-5 w-full shadow-sm overflow-y-auto max-h-[85vh] ${
                                wide ? "max-w-2xl" : "max-w-md"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                {title && (
                                    <DialogTitle className="text-base font-medium">{title}</DialogTitle>
                                )}
                                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                                    <X size={16} />
                                </button>
                            </div>
                            {children}
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </Dialog>
        </Transition>
    );
}
